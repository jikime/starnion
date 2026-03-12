.PHONY: starnion gateway all clean \
        docker-build docker-up docker-up-build docker-down \
        docker-down-volumes docker-logs docker-ps release-dry

DOCKER_DIR  := docker
COMPOSE     := docker compose -f $(DOCKER_DIR)/docker-compose.yml
GATEWAY_DIR := gateway
CLI_DIR     := $(GATEWAY_DIR)/internal/cli/migrations

# ── Build targets ─────────────────────────────────────────────────────────────

# Sync migration files into the CLI embed directory, then build starnion CLI
starnion: sync-migrations
	cd $(GATEWAY_DIR) && go build -o ../starnion ./cmd/starnion

# Build the gateway server binary only
gateway:
	cd $(GATEWAY_DIR) && go build -o ../bin/gateway ./cmd/gateway

# Build both binaries
all: sync-migrations starnion gateway

# Sync docker/init.sql and incremental migrations into the CLI embed path
sync-migrations:
	@echo "Syncing migrations..."
	@rm -rf $(CLI_DIR)
	@mkdir -p $(CLI_DIR)/incremental
	@cp docker/init.sql $(CLI_DIR)/init.sql
	@cp docker/migrations/incremental/*.sql $(CLI_DIR)/incremental/ 2>/dev/null || true
	@cp docker/migrations/incremental/README.md $(CLI_DIR)/incremental/ 2>/dev/null || true
	@echo "Synced init.sql + $$(ls $(CLI_DIR)/incremental/*.sql 2>/dev/null | wc -l | tr -d ' ') incremental migrations"

# Remove build artifacts
clean:
	@rm -f starnion bin/gateway
	@rm -rf $(CLI_DIR)
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
