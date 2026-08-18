import React, { useState } from "react";
import { Locate, Globe2 } from "lucide-react";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import type IpGeolocatePlugin from "../index";

interface IpGeolocateSidebarProps {
    plugin?: IpGeolocatePlugin;
}

type Result =
    | { status: "ok"; ip: string; name: string; code: string; lat: number; lng: number }
    | { status: "miss"; ip: string }
    | null;

export function IpGeolocateSidebar({ plugin }: IpGeolocateSidebarProps) {
    const [ip, setIp] = useState("");
    const [result, setResult] = useState<Result>(null);
    const [isBusy, setIsBusy] = useState(false);

    const handleLocate = () => {
        const trimmed = ip.trim();
        if (!trimmed || !plugin) return;
        setIsBusy(true);
        // Lookup is synchronous against bundled data — defer so the button
        // state renders before the (sub-millisecond) search completes.
        setTimeout(() => {
            try {
                const found = plugin.lookup(trimmed);
                if (found && found.name !== "Unknown") {
                    const entity: GeoEntity = {
                        id: "ip-geolocate-" + trimmed,
                        pluginId: "ip-geolocate",
                        latitude: found.lat,
                        longitude: found.lng,
                        timestamp: new Date(),
                        label: found.name,
                        properties: { ip: trimmed, countryCode: found.code },
                    };
                    plugin.pushResults([entity]);
                    setResult({
                        status: "ok",
                        ip: trimmed,
                        name: found.name,
                        code: found.code,
                        lat: found.lat,
                        lng: found.lng,
                    });
                } else {
                    plugin.pushResults([]);
                    setResult({ status: "miss", ip: trimmed });
                }
            } catch (err) {
                console.error("IP lookup failed", err);
                plugin.pushResults([]);
                setResult({ status: "miss", ip: trimmed });
            } finally {
                setIsBusy(false);
            }
        }, 0);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Globe2 size={16} color="var(--accent-blue)" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    IP Geolocate
                </span>
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. 8.8.8.8"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleLocate();
                    }}
                    style={{
                        flex: 1,
                        padding: "8px",
                        backgroundColor: "rgba(0,0,0,0.3)",
                        color: "#fff",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "4px",
                        fontSize: "13px",
                        fontFamily: "monospace",
                    }}
                />
                <button
                    onClick={handleLocate}
                    disabled={!ip.trim() || isBusy}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: !ip.trim() ? "var(--bg-tertiary)" : "var(--accent-blue)",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontWeight: 600,
                        fontSize: "12px",
                        cursor: !ip.trim() ? "not-allowed" : "pointer",
                        opacity: !ip.trim() ? 0.5 : 1,
                    }}
                >
                    <Locate size={14} />
                    Locate
                </button>
            </div>

            <div
                style={{
                    padding: "8px 10px",
                    borderRadius: "4px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    minHeight: "24px",
                }}
            >
                {result === null && "Enter an IPv4 address to place a marker at its country's centroid."}
                {result?.status === "ok" && (
                    <span style={{ color: "var(--text-primary)" }}>
                        <strong>{result.ip}</strong> → {result.name} ({result.code})
                        <span style={{ color: "var(--text-muted)" }}>
                            {" "}
                            · {result.lat.toFixed(1)}, {result.lng.toFixed(1)}
                        </span>
                    </span>
                )}
                {result?.status === "miss" && (
                    <span style={{ color: "#ef4444" }}>
                        No match for <strong>{result.ip}</strong> — invalid IP or not in the public dataset.
                    </span>
                )}
            </div>
        </div>
    );
}
