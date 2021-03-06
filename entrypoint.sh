#!/bin/sh

[[ -n "${WAIT_DB}" ]] && wait-on -l tcp:db:5432
[[ -n "${WAIT_MQ}" ]] && wait-on -l tcp:mq:5672
[[ -n "${WAIT_API}" ]] && wait-on -l tcp:api:3000

exec $@
