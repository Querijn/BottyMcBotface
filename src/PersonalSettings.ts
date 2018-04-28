export interface PersonalSettings {
    forum: {
        username: string;
        password: string;
    };

    discord: {
        key: string,
        owner: number
    };
    riotApi: {
        key: string;
    };
    webServer: {
        relativeFolderLocation: string;
        relativeLiveLocation: string;
    };
    github: {
        username: string;
        password: string;
    };

    isProduction: boolean;
}
