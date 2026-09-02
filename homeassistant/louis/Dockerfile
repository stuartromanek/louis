# Louis Home Assistant add-on — wraps the multi-arch GHCR image.
# Pin matches config.yaml version (bump both on release).
FROM ghcr.io/stuartromanek/louis:v1.2.2

# Map Supervisor options → LOUIS_* and start Nitro (image CMD is overridden).
COPY run.sh /run.sh
RUN chmod a+x /run.sh

WORKDIR /app
CMD ["/run.sh"]
