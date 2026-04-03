.PHONY: starnion gateway all clean \
        docker-build docker-up docker-up-build docker-down \
        docker-down-volumes docker-logs docker-ps \
        sync-migrations release-dry

DOCKER_DIR   := docker
COMPOSE      := docker compose -f $(DOCKER_DIR)/docker-compose.yml
CLI_DIR      := starnion-cli/internal/cli/migrations
MIGRATE_SRC  := db/migrations

# ── Build targets ─────────────────────────────────────────────────────────────

# Build starnion CLI (syncs migrations first)
starnion: sync-migrations
	cd starnion-cli && go build -o ../starnion ./cmd/starnion

# Build gateway server binary
gateway:
	cd gateway && go build -o ../bin/gateway ./cmd

# Build TypeScript agent
agent:
	cd agent && pnpm install --frozen-lockfile && pnpm build

# Build all
all: sync-migrations starnion gateway agent

# ── Migration sync ────────────────────────────────────────────────────────────

# Copy canonical migrations (db/migrations/) → starnion-cli embed path
sync-migrations:
	@echo "Syncing migrations..."
	@rm -rf $(CLI_DIR)
	@mkdir -p $(CLI_DIR)
	@cp $(MIGRATE_SRC)/*.sql $(CLI_DIR)/ 2>/dev/null || true
	@echo "Synced $$(ls $(CLI_DIR)/*.sql 2>/dev/null | wc -l | tr -d ' ') migrations"

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	@rm -f starnion bin/gateway
	@rm -rf $(CLI_DIR) .staging agent/dist
	@echo "Cleaned"

# ── Docker targets ────────────────────────────────────────────────────────────

docker-build:
	$(COMPOSE) build

docker-up:
	$(COMPOSE) up -d

docker-up-build:
	$(COMPOSE) up -d --build

docker-down:
	$(COMPOSE) down

docker-down-volumes:
	$(COMPOSE) down --volumes

docker-logs:
	$(COMPOSE) logs -f

docker-ps:
	$(COMPOSE) ps

# ── Release ───────────────────────────────────────────────────────────────────

release-dry:
	goreleaser release --snapshot --clean
