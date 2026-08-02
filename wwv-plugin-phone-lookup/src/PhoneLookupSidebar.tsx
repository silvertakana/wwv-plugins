import { useState } from "react";
import { PhoneNumberUtil, PhoneNumberFormat, PhoneNumberType } from "google-libphonenumber";
import { addLookedUpNumber } from "./phoneStore";
import { COUNTRY_CENTROIDS } from "./countryCentroids";

const phoneUtil = PhoneNumberUtil.getInstance();
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const TYPE_LABELS: Record<number, string> = {
    [PhoneNumberType.FIXED_LINE]: "Fixed line",
    [PhoneNumberType.MOBILE]: "Mobile",
    [PhoneNumberType.FIXED_LINE_OR_MOBILE]: "Fixed line or mobile",
    [PhoneNumberType.TOLL_FREE]: "Toll-free",
    [PhoneNumberType.PREMIUM_RATE]: "Premium rate",
    [PhoneNumberType.SHARED_COST]: "Shared cost",
    [PhoneNumberType.VOIP]: "VoIP",
    [PhoneNumberType.PERSONAL_NUMBER]: "Personal number",
    [PhoneNumberType.PAGER]: "Pager",
    [PhoneNumberType.UAN]: "UAN",
    [PhoneNumberType.VOICEMAIL]: "Voicemail",
    [PhoneNumberType.UNKNOWN]: "Unknown",
};

export default function PhoneLookupSidebar(): JSX.Element {
    const [value, setValue] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [isError, setIsError] = useState(false);

    function handleLookup() {
        const input = value.trim();
        if (!input) return;

        try {
            const parsed = phoneUtil.parseAndKeepRawInput(input);
            if (!phoneUtil.isValidNumber(parsed)) {
                setIsError(true);
                setStatus("Not a recognized phone number format. Try including the country code, e.g. +1 415 555 2671.");
                return;
            }

            const countryCode = phoneUtil.getRegionCodeForNumber(parsed) ?? "";
            const centroid = COUNTRY_CENTROIDS[countryCode];
            if (!centroid) {
                setIsError(true);
                setStatus(`Recognized as ${countryCode}, but no map centroid is available for that region.`);
                return;
            }

            const numberType = TYPE_LABELS[phoneUtil.getNumberType(parsed)] ?? "Unknown";
            const internationalFormat = phoneUtil.format(parsed, PhoneNumberFormat.INTERNATIONAL);
            const nationalFormat = phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL);
            const e164Format = phoneUtil.format(parsed, PhoneNumberFormat.E164);
            const countryName = (() => {
                try { return regionNames.of(countryCode) ?? countryCode; } catch { return countryCode; }
            })();

            addLookedUpNumber({
                input,
                countryCode,
                countryName,
                numberType,
                internationalFormat,
                nationalFormat,
                e164Format,
                latitude: centroid[0],
                longitude: centroid[1],
            });

            setIsError(false);
            setStatus(`${countryName} -- ${numberType}. Pin added to the globe.`);
            setValue("");
        } catch (err) {
            setIsError(true);
            setStatus(`Couldn't parse this number: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return (
        <div>
            <div style={{ display: "flex", gap: 6 }}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleLookup();
                    }}
                    placeholder="+1 415 555 2671"
                    style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-subtle, #475569)",
                        background: "var(--bg-input, #1e293b)",
                        color: "var(--text-primary, #e2e8f0)",
                        fontSize: 13,
                    }}
                />
                <button
                    type="button"
                    disabled={!value.trim()}
                    onClick={handleLookup}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "var(--accent-cyan, #38bdf8)",
                        color: "#0f172a",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: !value.trim() ? "not-allowed" : "pointer",
                        opacity: !value.trim() ? 0.6 : 1,
                    }}
                >
                    Locate
                </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted, #64748b)", lineHeight: 1.4 }}>
                Shows the number's registered country/region from its dialing-code format only -- not a real-time device location.
            </div>
            {status && (
                <div
                    key={status}
                    style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: isError ? "var(--danger, #f87171)" : "var(--text-secondary, #94a3b8)",
                        lineHeight: 1.4,
                        animation: "hudTextFlicker 0.6s ease-out both",
                    }}
                >
                    {status}
                </div>
            )}
        </div>
    );
}
