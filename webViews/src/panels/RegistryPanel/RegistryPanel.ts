class RegistryPanel {
    public formatValues(values) {
        let input = values;
        // eslint-disable-next-line array-callback-return
        Object.keys(values).map((key) => {
            if (typeof values[key] === 'object') {
                input[key] = this.formatValues(values[key]);
            } else if (typeof values[key] === 'string') {
                try {
                    // Try and parse it to see if it's json
                    values[key] = JSON.parse(values[key]);
                } catch (e) {
                    // If we fail we leave it unchanged
                }
            }
        });

        return input;
    }
}

const registryPanel = new RegistryPanel();

export {
    registryPanel
};
