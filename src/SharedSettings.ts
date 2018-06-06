export interface PersonalSettings {
    forum: {
        username: string;
        password: string;
    };

    discord: {
        key: string,
        owner: number;
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

export interface SharedSettings {
    server: string;

    botty: PersonalSettings;

    uptimeSettings: {
        checkInterval: number,
    };

    commands: {
        default_prefix: string,
        adminRoles: string[];
    };

    techBlog: {
        checkInterval: number,
        channel: string,
        url: string,
    };

    keyFinder: {
        reportChannel: string,
    };

    forum: {
        checkInterval: number,
        channel: string,
        url: string,
    };

    autoReact: {
        emoji: string,
    };

    info: {
        allowedRoles: string[],
        command: string,
        maxScore: number,
    };

    officehours: {
        allowedRoles: string[],
        openMessage: string,
        closeMessage: string,
        addedMessage: string,
        removedMessage: string,
    };

    riotApiLibraries: {
        noLanguage: string,
        languageList: string,
        githubErrorList: string,
        githubErrorLanguage: string,
        baseURL: string,
        aliases: { [key: string]: string[] },
    };

    versionChecker: {
        checkInterval: number,
        channel: string,
        gameThumbnail: string,
        dataDragonThumbnail: string,
    };

    logger: {
        server: string,

        prod: {
            errorChannel: string,
            logChannel: string,
        },

        dev: {
            errorChannel: string,
            logChannel: string,
        }

        errorChannel: string,
        logChannel: string,
    };

    apiStatus: {
        checkInterval: number,
        apiOnFireThreshold: number,
        statusUrl: string,
        onFireImages: string[],
    };

    onJoin: {
        messageFile: string;
    };

    apiUrlInterpreter: {
        timeOutDuration: number;
    };
}
