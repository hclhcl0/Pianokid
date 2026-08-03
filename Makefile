.PHONY: up down build seed logs restart migrate studio

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build --no-cache

seed:
	docker-compose exec piano-backend npx ts-node prisma/seed.ts

logs:
	docker-compose logs -f

restart:
	docker-compose restart

migrate:
	docker-compose exec piano-backend npx prisma migrate deploy

studio:
	docker-compose exec piano-backend npx prisma studio
