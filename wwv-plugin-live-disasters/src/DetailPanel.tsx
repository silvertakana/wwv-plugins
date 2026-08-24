import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

function toStr(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export function LiveDisasterDetail({ entity }: { entity: GeoEntity }) {
    const props = entity.properties ?? {};
    const title = toStr(props.title);
    const eventtype = toStr(props.eventtype);
    const alertlevel = toStr(props.alertlevel);
    const country = toStr(props.countryName) ?? toStr(props.country);
    const description = toStr(props.description);
    const rawLink = toStr(props.link);
    const link = rawLink?.startsWith("url:") ? rawLink.slice(4) : rawLink;
    const pubDateTag = toStr(props.pubDate);
    const pubDateIso = pubDateTag?.startsWith("datetime:") ? pubDateTag.slice(9) : pubDateTag;
    const pubDate = pubDateIso ? new Date(pubDateIso) : null;
    const severityColor =
        alertlevel === "red" ? "#dc2626" : alertlevel === "orange" ? "#f97316" : alertlevel === "green" ? "#22c55e" : "#9ca3af";

    return (
        <div style={{ padding: "8px 4px", fontSize: 13, lineHeight: 1.5 }}>
            {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", alignItems: "baseline" }}>
                {eventtype ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Type</dt>
                        <dd style={{ margin: 0 }}>{eventtype}</dd>
                    </>
                ) : null}
                {alertlevel ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Alert level</dt>
                        <dd style={{ margin: 0, textTransform: "capitalize" }}>
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    backgroundColor: severityColor,
                                    marginRight: 6,
                                    verticalAlign: "middle",
                                }}
                            />
                            {alertlevel}
                        </dd>
                    </>
                ) : null}
                {country ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Country</dt>
                        <dd style={{ margin: 0 }}>{country}</dd>
                    </>
                ) : null}
                {pubDate ? (
                    <>
                        <dt style={{ color: "#94a3b8" }}>Published</dt>
                        <dd style={{ margin: 0 }}>{pubDate.toLocaleString()}</dd>
                    </>
                ) : null}
            </dl>
            {description ? <div style={{ marginTop: 8, color: "#cbd5e1" }}>{description}</div> : null}
            {link ? (
                <div style={{ marginTop: 10 }}>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>
                        Open GDACS report
                    </a>
                </div>
            ) : null}
        </div>
    );
}