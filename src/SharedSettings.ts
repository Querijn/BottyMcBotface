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
        channel: string,
        url: string
    },
    keyFinder: {
        reportChannel: string
    },
    forum: {
        checkInterval: number,
        channel: string,
        url: string
    }
    honeypot: {
        reportChannel: string;
    },
    info: {
        allowedRoles: string[],
        command: string
    }
}