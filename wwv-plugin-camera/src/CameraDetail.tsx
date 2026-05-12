"use client";

import React from "react";
import { ExternalLink, MapPin, Tag } from "lucide-react";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import { CameraStream } from "@/components/video/CameraStream";

interface CameraDetailProps { entity: GeoEntity; }

export const CameraDetail: React.FC<CameraDetailProps> = ({ entity }) => {
    const { properties } = entity;
    const stream = properties.stream as string;
    const previewUrl = properties.preview_url as string;
    const city = properties.city as string;
    const region = properties.region as string;
    const country = properties.country as string;
    const isIframe = !!properties.is_iframe;
    const categories = (properties.categories as string[]) || [];

    return (
        <div className="flex flex-col gap-4">
            <CameraStream id={entity.id} streamUrl={stream} previewUrl={previewUrl} isIframe={isIframe} label={city || country} />
            <div className="intel-panel__props">
                <div className="intel-panel__prop" style={{ flexDirection: "column", alignItems: "flex-start", gap: "var(--space-xs)", borderBottom: "1px solid var(--border-subtle)", padding: "var(--space-sm) 0" }}>
                    <span className="intel-panel__prop-key">Location</span>
                    <span className="intel-panel__prop-value" style={{ textAlign: "left", width: "100%", whiteSpace: "normal", lineHeight: "1.4", fontSize: "12px", color: "var(--text-primary)" }}>
                        {[city, region, country].filter(Boolean).join(", ")}
                    </span>
                </div>
                {categories.length > 0 && (
                    <div className="intel-panel__prop" style={{ flexDirection: "column", alignItems: "flex-start", gap: "var(--space-sm)", borderBottom: "none", padding: "var(--space-sm) 0" }}>
                        <span className="intel-panel__prop-key">Categories</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {categories.map((cat) => (
                                <span key={cat} style={{ borderRadius: "12px", backgroundColor: "var(--bg-tertiary)", padding: "2px 8px", fontSize: "10px", fontWeight: 500, color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                                    {cat}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
