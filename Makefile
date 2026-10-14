.PHONY: dev

dev:
	@command -v portless >/dev/null || { echo 'Install Portless first: npm install -g portless'; exit 1; }
	@node scripts/stop-dev.mjs
	@portless deckle --force npm run dev
