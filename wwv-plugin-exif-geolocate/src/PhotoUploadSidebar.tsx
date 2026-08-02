import { useState } from "react";
import * as exifr from "exifr";
import { addUploadedPhoto } from "./photoStore";

export default function PhotoUploadSidebar() {
    const [status, setStatus] = useState<string | null>(null);
    const [isError, setIsError] = useState(false);

    async function handleFile(file: File) {
        setStatus("Reading EXIF data...");
        setIsError(false);
        try {
            // exifr.gps() only reads the GPS IFD -- switching to parse() with
            // an explicit pick list reads the same GPS block (exifr computes
            // the "latitude"/"longitude" virtual tags automatically whenever
            // they're picked) plus camera/timestamp/altitude tags the narrow
            // gps() helper never touched.
            const tags = await exifr.parse(file, {
                pick: ["latitude", "longitude", "DateTimeOriginal", "Make", "Model", "GPSAltitude"],
            });
            if (!tags || !Number.isFinite(tags.latitude) || !Number.isFinite(tags.longitude)) {
                setIsError(true);
                setStatus("No GPS location found in this photo's metadata (most phone screenshots and downloaded/edited images strip this).");
                return;
            }

            const objectUrl = URL.createObjectURL(file);
            addUploadedPhoto({
                fileName: file.name,
                latitude: tags.latitude,
                longitude: tags.longitude,
                thumbnailUrl: objectUrl,
                dateTaken: tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal.toISOString() : null,
                cameraMake: tags.Make ?? null,
                cameraModel: tags.Model ?? null,
                altitudeMeters: Number.isFinite(tags.GPSAltitude) ? tags.GPSAltitude : null,
            });

            setStatus(`Located at ${tags.latitude.toFixed(5)}, ${tags.longitude.toFixed(5)} -- pin added to the globe.`);
        } catch (err) {
            setIsError(true);
            setStatus(`Couldn't read this file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return (
        <div>
            <label
                htmlFor="exif-geolocate-file-input"
                style={{
                    display: "block",
                    padding: "10px 14px",
                    borderRadius: 6,
                    border: "1px dashed var(--border-subtle, #475569)",
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-primary, #e2e8f0)",
                }}
            >
                Upload a photo to locate it
                <input
                    id="exif-geolocate-file-input"
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(file);
                        e.target.value = "";
                    }}
                />
            </label>
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
