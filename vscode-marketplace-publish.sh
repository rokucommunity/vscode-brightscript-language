printf "Applying Token"
echo "[{\"name\":\"celsoaf\",\"pat\":\"$VSCE_TOKEN\"}]" > ~/.vsce
npm run publish