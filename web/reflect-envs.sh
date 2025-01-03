#!/bin/bash

envsubst '$SERVER_ADDRESS' < /etc/nginx/nginx.template.conf > /etc/nginx/nginx.conf
echo `cat /etc/nginx/nginx.conf`
