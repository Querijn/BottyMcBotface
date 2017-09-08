export interface SharedSettings {
    server: string,
    channelAccess: {
        forcedChannels: string[],
        restrictedChannels: string[]
    },
    uptimeSettings: {
        checkInterval: number
    },
    techBlog: {
        checkInterval: number,
        server: string,
        channel: string,
        url: string
    },
    keyFinder: {
        server: string,
        reportChannel: string
    },
    forum: {
        checkInterval: number,
        server: string,
        channel: string,
        url: string
    }
    honeypot: {
        server: string;
        reportChannel: string;
    },
    info: {
        allowedRoles: string[]
    }
}