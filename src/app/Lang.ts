export class Lang {
    language = 'en';
    texts: { [language: string]: { [key: string]: string } } = {
        en: {
            หมากฮอส: 'Checkers',
            ตาที่: 'Turn #',
            ผู้เล่น: 'Player',
            อัศวิน: 'Knight',
            คิง: 'King',
            ตัว: 'Pieces'
        }
    };

    txt(key: string): string {
        return this.texts[this.language][key] || key;
    }
}
