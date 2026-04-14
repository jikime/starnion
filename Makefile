.PHONY: starnion gateway all clean proto \
        docker-build docker-up docker-up-build docker-down \
        docker-down-volumes docker-logs docker-ps \
        release-dry

DOCKER_DIR := docker
COMPOSE    := docker compose -f $(DOCKER_DIR)/docker-compose.yml

# ── Build targets ─────────────────────────────────────────────────────────────
#
# SQL migrations live in the shared `migrations/` Go module and are
# embedded into both binaries automatically — no copy step needed.

# Build starnion CLI
starnion:
	cd starnion-cli && go build -o ../starnion ./cmd/starnion

# Build gateway server binary
gateway:
	cd gateway && go build -o ../bin/gateway ./cmd

# Build TypeScript agent
agent:
	cd agent && pnpm install --frozen-lockfile && pnpm build

# Build all
all: starnion gateway agent

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

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	@rm -f starnion bin/gateway
	@rm -rf .staging agent/dist
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
