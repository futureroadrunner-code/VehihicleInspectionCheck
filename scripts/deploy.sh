#!/usr/bin/env bash
# Deploy ASCA Vehicle Check next to DaVision: Cloud Run + Firebase Hosting in
# the same Google project, emailing through the same Microsoft 365 settings.
#
# Run from Google Cloud Shell (shell.cloud.google.com) in this repo:
#   ./scripts/deploy.sh
set -euo pipefail

PROJECT="${PROJECT:-davision-f9a1e}"
REGION="${REGION:-us-central1}"
SERVICE="asca-vehicle-check"      # Cloud Run service (must match firebase.json)
SITE="asca-vehicle-check"         # Firebase Hosting site (must match firebase.json)
DAVISION_SERVICE="asca-vision"    # where the Microsoft 365 settings are copied from
MAIL_TO="${MAIL_TO:-mariob@ascaofficesolutions.com}"
FIREBASE="npx -y firebase-tools@latest"

cd "$(dirname "$0")/.."
gcloud config set project "$PROJECT" >/dev/null

echo "▸ Reading the Microsoft 365 email settings from DaVision ($DAVISION_SERVICE)…"
svc_json="$(gcloud run services describe "$DAVISION_SERVICE" --region "$REGION" --format=json)"
envfile="$(mktemp)"
trap 'rm -f "$envfile"' EXIT
secrets=()
for key in M365_TENANT_ID M365_CLIENT_ID M365_CLIENT_SECRET MAIL_FROM; do
  entry="$(jq -c --arg k "$key" '.spec.template.spec.containers[0].env[]? | select(.name == $k)' <<<"$svc_json")"
  if [[ -z "$entry" ]]; then
    echo "✗ DaVision has no $key set, so there is no email setup to copy." >&2
    echo "  Set up DaVision's Microsoft 365 email first (DaVision docs/M365_SETUP.md)." >&2
    exit 1
  fi
  if jq -e '.valueFrom.secretKeyRef' <<<"$entry" >/dev/null; then
    # Stored in Secret Manager: point at the same secret instead of copying it.
    secrets+=("$key=$(jq -r '.valueFrom.secretKeyRef.name' <<<"$entry"):$(jq -r '.valueFrom.secretKeyRef.key' <<<"$entry")")
  else
    printf '%s: %s\n' "$key" "$(jq '.value' <<<"$entry")" >>"$envfile"
  fi
done
printf 'MAIL_TO: "%s"\n' "$MAIL_TO" >>"$envfile"
echo "  ✓ found (values are not printed)"

echo "▸ Building and deploying the app to Cloud Run ($SERVICE)…"
args=(--source . --region "$REGION" --allow-unauthenticated --memory 512Mi --cpu 1
  --min-instances 0 --max-instances 3 --timeout 120 --env-vars-file "$envfile")
if ((${#secrets[@]})); then args+=(--set-secrets "$(IFS=,; echo "${secrets[*]}")"); fi
gcloud run deploy "$SERVICE" "${args[@]}"

echo "▸ Publishing the Firebase Hosting address…"
if ! $FIREBASE projects:list >/dev/null 2>&1; then
  $FIREBASE login --no-localhost
fi
if ! $FIREBASE hosting:sites:get "$SITE" --project "$PROJECT" >/dev/null 2>&1; then
  $FIREBASE hosting:sites:create "$SITE" --project "$PROJECT"
fi
$FIREBASE deploy --only hosting --project "$PROJECT" --non-interactive

echo
echo "✓ Live at https://$SITE.web.app"
