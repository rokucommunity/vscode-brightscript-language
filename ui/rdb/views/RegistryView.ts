class RegistryView {
    public formatValues(values) {
        let input = values;
        Object.keys(values).map((key) => {
            if (typeof values[key] == 'object') {
                input[key] = this.formatValues(values[key]);
            } else if (typeof values[key] == 'string' && this.isJSON(values[key])) {
                values[key] = JSON.parse(values[key]);
            }
        });

        return input;
    }

    public isJSON(str) {
        try {
            const jsonObject = JSON.parse(str);
            return jsonObject && typeof jsonObject === 'object';
        } catch (e) {
            return false;
        }
    }
}

const registryView = new RegistryView();

export {
    registryView
}
