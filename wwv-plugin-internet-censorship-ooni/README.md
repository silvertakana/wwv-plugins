# wwv-plugin-internet-censorship-ooni

WorldWideView plugin for OONI internet censorship measurements.

- Source: data engine `/api/internet-censorship-ooni`
- Renders measurements as points colored by state: red = blocked (confirmed), amber = anomaly, green = accessible.
- Properties include probe CC/ASN, test name, target URL, anomaly/confirmed flags, blockingGeneral, and measuredAt.
- Filters: status, test name, probe country code.