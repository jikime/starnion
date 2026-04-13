.PHONY: starnion gateway all clean proto \
        docker-build docker-up docker-up-build docker-down \
        docker-down-volumes docker-logs docker-ps \
        sync-migrations release-dry

DOCKER_DIR   := docker
COMPOSE      := docker compose -f $(DOCKER_DIR)/docker-compose.yml
CLI_DIR      := starnion-cli/internal/cli/migrations
GW_DIR       := gateway/internal/infrastructure/database/migrations
MIGRATE_SRC  := db/migrations

# ── Build targets ─────────────────────────────────────────────────────────────

# Build starnion CLI (syncs migrations first)
starnion: sync-migrations
	cd starnion-cli && go build -o ../starnion ./cmd/starnion

# Build gateway server binary (syncs migrations first)
gateway: sync-migrations
	cd gateway && go build -o ../bin/gateway ./cmd

# Build TypeScript agent
agent:
	cd agent && pnpm install --frozen-lockfile && pnpm build

# Build all
all: sync-migrations starnion gateway agent

# ── Proto codegen ─────────────────────────────────────────────────────────────

# Regenerate Go bindings from proto/agent.proto into gateway/proto/agent.
# Requires protoc + protoc-gen-go + protoc-gen-go-grpc on PATH.
#
# The go_package in agent.proto points at gateway/proto/agent (NOT the
# old internal/infrastructure/grpc/proto) so any future Go service can
# reuse the typed messages; the `internal/` prefix used to block that.
proto:
	@echo "Regenerating proto bindings → gateway/proto/agent..."
	@protoc \
		--go_out=. \
		--go_opt=module=github.com/newstarnion \
		--go-grpc_out=. \
		--go-grpc_opt=module=github.com/newstarnion \
		-I proto \
		proto/agent.proto
	@echo "Done."

# ── Migration sync ────────────────────────────────────────────────────────────

# Copy canonical migrations (db/migrations/) → both Go embed targets.
# This is the SINGLE SOURCE OF TRUTH enforcement: the sync targets are
# git-ignored (see .gitignore) so drift is physically impossible — a
# hand-edit to a copied file is wiped on the next build.
sync-migrations:
	@echo "Syncing migrations from $(MIGRATE_SRC)..."
	@rm -rf $(CLI_DIR) $(GW_DIR)
	@mkdir -p $(CLI_DIR) $(GW_DIR)
	@cp $(MIGRATE_SRC)/*.sql $(CLI_DIR)/ 2>/dev/null || true
	@cp $(MIGRATE_SRC)/*.sql $(GW_DIR)/   2>/dev/null || true
	@echo "Synced $$(ls $(CLI_DIR)/*.sql 2>/dev/null | wc -l | tr -d ' ') migrations → cli, $$(ls $(GW_DIR)/*.sql 2>/dev/null | wc -l | tr -d ' ') → gateway"

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
