export default class BrightScriptFileUtils {
    public getAlternateFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.brs'))) {
            return fileName.substring(0, fileName.length - 4) + '.xml';
        } else if (fileName !== undefined && (fileName.toLowerCase().endsWith('.bs'))) {
            return fileName.substring(0, fileName.length - 3) + '.xml';
        } else if (fileName !== undefined && fileName.toLowerCase().endsWith('.xml')) {
            return fileName.substring(0, fileName.length - 4) + '.brs';
        } else {
            return undefined;
        }
    }
    public getAlternateBrsFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.bs'))) {
            return fileName.substring(0, fileName.length - 2) + 'brs';
        } else if (fileName.toLowerCase().endsWith('.brs')) {
            return fileName.substring(0, fileName.length - 3) + 'bs';
        } else {
            return fileName;
        }
    }

    public getBrsFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.bs'))) {
            return fileName.substring(0, fileName.length - 2) + 'brs';
        } else if (fileName.toLowerCase().endsWith('.brs')) {
            return fileName;
        }
    }

    public getBsFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.brs'))) {
            return fileName.substring(0, fileName.length - 3) + 'bs';
        } else if (fileName.toLowerCase().endsWith('.bs')) {
            return fileName;
        } else {
            return undefined;
        }
    }
}
