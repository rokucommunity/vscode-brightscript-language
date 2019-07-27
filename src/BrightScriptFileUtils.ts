export default class BrightScriptFileUtils {
    public getAlternateFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.brs') || fileName.toLowerCase().endsWith('.bs'))) {
            //jump to xml file
            return fileName.substring(0, fileName.length - 4) + '.xml';
        } else if (fileName !== undefined && fileName.toLowerCase().endsWith('.xml')) {
            //jump to brs file
            //TODO - check if the file is a .bs file!
            return fileName.substring(0, fileName.length - 4) + '.brs';
        } else {
            return undefined;
        }
    }
}
