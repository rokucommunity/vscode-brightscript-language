export default class BrightScriptFileUtils {
    public getAlternateFileName(fileName: string): string | undefined {
        if (fileName !== undefined && fileName.toLowerCase().endsWith('.brs')) {
            //jump to xml file
            return fileName.substring(0, fileName.length - 4) + '.xml';
        } else if (fileName !== undefined && fileName.toLowerCase().endsWith('.xml')) {
            //jump to brs file
            return fileName.substring(0, fileName.length - 4) + '.brs';
        } else {
            return undefined;
        }
    }
}
