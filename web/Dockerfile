# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# The VITE_* build args are public client-side config that Vite inlines into the
# browser bundle (the Maps key is restricted by HTTP referrer, the OAuth client ID
# is public by design). They are not secrets, so the SecretsUsedInArgOrEnv check
# is intentionally skipped here.

FROM node:24.22.1 AS build-stage

WORKDIR /work

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps

COPY . .

ARG VITE_GOOGLE_API_KEY
ENV VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY
ARG VITE_GOOGLE_OAUTH_CLIENT_ID
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=$VITE_GOOGLE_OAUTH_CLIENT_ID
ARG VITE_BASEMAP_PMTILES_URL=/maps/japan-light-20251201-v1.pmtiles
ENV VITE_BASEMAP_PMTILES_URL=$VITE_BASEMAP_PMTILES_URL

RUN npm run build


FROM nginx:1.30.0

COPY --from=build-stage /work/build/client /work/build/client
COPY nginx.template.conf /etc/nginx/nginx.template.conf
COPY reflect-envs.sh /docker-entrypoint.d/reflect-envs.sh
RUN chmod +x /docker-entrypoint.d/reflect-envs.sh

EXPOSE 80
