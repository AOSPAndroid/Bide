# iOS/Android app build (npm run build:app): sign-in only, no purchase in the app.
# Put the server addresses and VITE_LICENCE_PUBLIC_KEY in .env.app.local (git ignores *.local):
#   VITE_LICENCE_API=https://bide.example
#   VITE_MODEL_BASE=https://bide.example/
VITE_PAYWALL=1
VITE_APP_STORE=1
