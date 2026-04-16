class RegistryView {
    public formatValues(values) {
        let input = values;
        // eslint-disable-next-line array-callback-return
        Object.keys(values).map((key) => {
            if (typeof values[key] === 'object') {
                input[key] = this.formatValues(values[key]);
            } else if (typeof values[key] === 'string') {
                try {
                    // Try and parse it to see if it's json
                    // Only want to convert with json if not a number or boolean
                    const result = JSON.parse(values[key]);
                    if (typeof result !== 'number' && typeof result !== 'boolean') {
                        values[key] = result;
                    }
                } catch (e) {
                    // If we fail we leave it unchanged
                }
            }
        });

        return input;
    }
}

const registryView = new RegistryView();

export {
    registryView
};
