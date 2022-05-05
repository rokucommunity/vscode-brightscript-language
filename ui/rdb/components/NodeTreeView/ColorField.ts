class ColorField {
    convertIntegerColorToRgb(integerColor: number) {
        // Have to convert from signed to unsigned and then convert to binary representation
        const unsignedInteger = integerColor >>> 0; // eslint-disable-line no-bitwise
        const binary = unsignedInteger.toString(2).padStart(32, '0');

        // Slice out each 8 bits for each rgba part value
        const rgb = {
            red: parseInt(binary.slice(0, 8), 2),
            green: parseInt(binary.slice(8, 16), 2),
            blue: parseInt(binary.slice(16, 24), 2),
            alpha: parseInt(binary.slice(24, 32), 2)
        };
        return rgb;
    }

    convertHexPart(byte: number) {
        return byte.toString(16).padStart(2, '0').toUpperCase();
    }

    convertRgbToHex(rgb: ReturnType<typeof ColorField.prototype.convertIntegerColorToRgb>) {
        return `#${this.convertHexPart(rgb.red)}${this.convertHexPart(rgb.green)}${this.convertHexPart(rgb.blue)}${this.convertHexPart(rgb.alpha)}`;
    }
}

const colorField = new ColorField();

export {
    colorField
};
