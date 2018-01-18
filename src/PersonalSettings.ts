export interface PersonalSettings {
    forum: {
        username: string;
        password: string;
    }
    discord: {
        key: string,
        owner: number
    },
    honeypot: {
        token: string,
        owner: number
    },
    riotApi: {
        key: string
    },
    webServer: {
        relativeFolderLocation: string,
        relativeLiveLocation: string
    },
    isProduction: boolean
}