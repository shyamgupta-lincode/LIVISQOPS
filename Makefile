# FactoryOps one-shot orchestration
SHELL := /bin/bash
export PATH := $(CURDIR)/.tools/bin:$(PATH)
PROFILE ?= local
KUBE_CONTEXT ?=
DOMAIN ?= localhost
COMPOSE := docker compose -f infra/compose/docker-compose.yml --env-file .env
COMPOSE_DIR := infra/compose

.PHONY: one-shot verify down demo-reset preflight env up migrate seed smoke wait-ready helm-lint logs ps

one-shot: env preflight
	@bash scripts/one-shot.sh PROFILE=$(PROFILE) KUBE_CONTEXT="$(KUBE_CONTEXT)" DOMAIN="$(DOMAIN)"

verify:
	@bash scripts/verify.sh

down:
	@$(COMPOSE) down --remove-orphans

demo-reset:
	@bash scripts/seed.sh --demo-reset

preflight:
	@bash scripts/preflight.sh

env:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example"; fi
	@bash scripts/generate-secrets.sh

up: env
	@$(COMPOSE) up -d --build

migrate:
	@$(COMPOSE) run --rm api python -m factoryops_api.migrate

seed:
	@bash scripts/seed.sh

wait-ready:
	@bash scripts/wait-ready.sh

smoke:
	@bash scripts/smoke.sh

helm-lint:
	@helm lint infra/helm/factoryops || true
	@helm template factoryops infra/helm/factoryops >/tmp/factoryops-render.yaml
	@echo "Helm render OK → /tmp/factoryops-render.yaml"

logs:
	@$(COMPOSE) logs -f --tail=200

ps:
	@$(COMPOSE) ps
