export default class BrightScriptFileUtils {
    /**
     * Utility method to simplify getting alternate xml/brs|bs extensions
     * @param  {string} fileName
     * @returns {string} Returns the xml file name, if filename is a brs or bs file, otherwise the brs filename.
     */
    public getAlternateFileName(fileName: string): string | undefined {
        let lowerFileName = fileName?.toLowerCase();
        if (lowerFileName.endsWith('.brs') || lowerFileName?.endsWith('.bs')) {
            return fileName.replace(/\.b(r?)s$/, '.xml');
        } else if (lowerFileName?.endsWith('.xml')) {
            return fileName.substring(0, fileName.length - 4) + '.brs';
        }
    }

    /**
     * Utility method to simplify getting alternate brs/bs extensions
     * @param  {string} fileName
     * @returns {string} Returns the brs file name, if filename is a brs file, otherwise the bs filename. If filenAMe is neither, then fileName is returned unchanged
     */
    public getAlternateBrsFileName(fileName: string): string | undefined {
        if (fileName !== undefined && (fileName.toLowerCase().endsWith('.bs'))) {
            return fileName.substring(0, fileName.length - 2) + 'brs';
        } else if (fileName.toLowerCase().endsWith('.brs')) {
            return fileName.substring(0, fileName.length - 3) + 'bs';
        } else {
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
