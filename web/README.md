# Noodle Map Web

React + TypeScript frontend built with Vite.

## Requirements

- Node.js 22.12.0
- npm 10.9.2

This project has Volta settings in `package.json`, so using Volta is recommended.

## Development Server

The default development server uses HTTPS so browser geolocation works when testing from a phone on the same LAN.

```powershell
npm run dev
```

Use the LAN URL printed by Vite, for example:

```text
https://192.168.1.10:5173
```

If you need the old HTTP server for a quick local check:

```powershell
npm run dev:http
```

## HTTPS Certificate Setup

Create a local certificate with `mkcert`. Replace `192.168.1.10` with the PC's LAN IP address.

```powershell
mkdir certs
mkcert -install
mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem localhost 127.0.0.1 192.168.1.10
```

Add the certificate paths to `web/.env`:

```env
DEV_HTTPS_KEY=certs/dev-key.pem
DEV_HTTPS_CERT=certs/dev-cert.pem
```

`certs/` and `.env` are intentionally ignored by Git. Do not commit certificate private keys. A `mkcert` certificate is tied to the local CA on the machine that created it, so committing it is usually not useful for other developers anyway.

For phone testing, the phone must also trust the `mkcert` root CA. Without that, the page may load with a certificate warning and browser geolocation can still be blocked.

## Build

```powershell
npm run build
```

The build runs mojibake checks, ESLint, TypeScript checks, and the Vite production build.
