#!/bin/sh
set -e
npx prisma migrate deploy
node server.js
