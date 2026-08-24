import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

function toStr(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

/** Strip the `url:` tag applied by urlProp() so it can back an `<a href>`. */
function unwrapUrl(value: unknown): string | null {
    const raw = toStr(value);
    return raw?.startsWith("url:") ? raw.slice(4) : raw;
}

/** Render the NET ISO string as a localised date-time. */
function formatNet(value: unknown): string | null {
    const iso = toStr(value);
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Click-detail panel for a launch-tracker entity: launch identity, NET,
 * status, mission, rocket, provider, pad + location, and (when the engine
 * item carries it) a link to the Launch Library 2 launch page.
 */
export function LaunchTrackerDetail({ entity }: { entity: GeoEntity }) {
    const props = entity.properties ?? {};
    const title = toStr(props.name) ?? toStr(entity.label) ?? "Launch";
    const net = formatNet(props.net);
    const status = toStr(props.status);
    const mission = toStr(props.mission);
    const missionType = toStr(props.missionType);
    const rocket = toStr(props.rocket);
    const rocketFamily = toStr(props.rocketFamily);
    const provider = toStr(props.provider);
    const padName = toStr(props.padName);
    const location = toStr(props.location);
    const webcastLive = props.webcastLive === true;
    const link = unwrapUrl(props.launchUrl);

    return (
        <div style={{ padding: "8px 4px", fontSize: 13, lineHeight: 1.5 }}>
            {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", alignItems: "baseline" }}>
                {net ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>NET</dt>
                        <dd style={{ margin: 0 }}>{net}</dd>
                    </>
                ) : null}
                {status ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Status</dt>
                        <dd style={{ margin: 0 }}>{status}</dd>
                    </>
                ) : null}
                {mission ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Mission</dt>
                        <dd style={{ margin: 0 }}>
                            {mission}
                            {missionType ? <span style={{ color: "#94a3b8" }}> · {missionType}</span> : null}
                        </dd>
                    </>
                ) : null}
                {rocket ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Rocket</dt>
                        <dd style={{ margin: 0 }}>
                            {rocket}
                            {rocketFamily ? <span style={{ color: "#94a3b8" }}> · {rocketFamily}</span> : null}
                        </dd>
                    </>
                ) : null}
                {provider ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Provider</dt>
                        <dd style={{ margin: 0 }}>{provider}</dd>
                    </>
                ) : null}
                {padName ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Pad</dt>
                        <dd style={{ margin: 0 }}>{padName}</dd>
                    </>
                ) : null}
                {location ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Location</dt>
                        <dd style={{ margin: 0 }}>{location}</dd>
                    </>
                ) : null}
            </dl>
            {webcastLive ? (
                <div style={{ marginTop: 8, color: "#22c55e", fontWeight: 600 }}>● Live webcast</div>
            ) : null}
            {link ? (
                <div style={{ marginTop: 10 }}>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>
                        Open on Launch Library 2
                    </a>
                </div>
            ) : null}
        </div>
    );
}