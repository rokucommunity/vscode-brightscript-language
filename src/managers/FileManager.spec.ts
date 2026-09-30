import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { FileManager } from './FileManager';

describe('FileManager', () => {
    let fileManager: FileManager;

    beforeEach(() => {
        fileManager = new FileManager();
    });

    describe('fileExists', () => {
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/testFile`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should return true when found', async () => {
            fsExtra.writeFileSync(filePath, '# my test content');
            assert.equal((await fileManager.fileExists(filePath)), true);
        });

        it('should return false when not found', async () => {
            assert.equal((await fileManager.fileExists(filePath)), false);
        });
    });

    describe('convertManifestToObject', () => {
        let fileContents: string;
        let expectedManifestObject: Record<string, string>;
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fileContents = `# Channel Details
                title=HeroGridChannel
                subtitle=Roku Sample Channel App
                major_version=1
                minor_version=1
                build_version=00001

                # Channel Assets
                mm_icon_focus_hd=pkg:/images/channel-poster_hd.png
                mm_icon_focus_sd=pkg:/images/channel-poster_sd.png

                # Splash Screen + Loading Screen Artwork
                splash_screen_sd=pkg:/images/splash-screen_sd.jpg
                splash_screen_hd=pkg:/images/splash-screen_hd.jpg
                splash_screen_fhd=pkg:/images/splash-screen_fhd.jpg
                splash_color=#808080
                splash_min_time=0
                # Resolution
                ui_resolutions=fhd

                confirm_partner_button=1
                bs_const=const=false;const2=true;const3=false
            `.replace(/ {4}/g, '');

            expectedManifestObject = {
                title: 'HeroGridChannel',
                subtitle: 'Roku Sample Channel App',
                'major_version': '1',
                'minor_version': '1',
                'build_version': '00001',
                'mm_icon_focus_hd': 'pkg:/images/channel-poster_hd.png',
                'mm_icon_focus_sd': 'pkg:/images/channel-poster_sd.png',
                'splash_screen_sd': 'pkg:/images/splash-screen_sd.jpg',
                'splash_screen_hd': 'pkg:/images/splash-screen_hd.jpg',
                'splash_screen_fhd': 'pkg:/images/splash-screen_fhd.jpg',
                'splash_color': '#808080',
                'splash_min_time': '0',
                'ui_resolutions': 'fhd',
                'confirm_partner_button': '1',
                'bs_const': 'const=false;const2=true;const3=false'
            };

            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/manifest`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should read the manifest and return an js object version of it', async () => {
            fsExtra.writeFileSync(filePath, fileContents);
            let manifestObject = await fileManager.convertManifestToObject(filePath);
            assert.deepEqual(manifestObject, expectedManifestObject);
        });

        it('should return undefined when the manifest is not found', async () => {
            let manifestObject = await fileManager.convertManifestToObject(filePath);
            assert.equal(manifestObject, undefined);
        });
    });
});
