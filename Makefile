.PHONY: setup up start migrate seed test lint typecheck dev build down logs

setup:
	cd api && npm install
	cd dashboard && npm install

up:
	docker compose up -d --build

start:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec -T api npm run migrate

seed:
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-event_analytics} -c "TRUNCATE events, users CASCADE;"
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-event_analytics} -f /seed/generate_seed.sql

test:
	cd api && npm test

lint:
	cd api && npm run lint
	cd dashboard && npm run lint

typecheck:
	cd api && npm run typecheck
	cd dashboard && npm run typecheck

dev:
	cd dashboard && npm run dev

build:
	cd dashboard && npm run build
