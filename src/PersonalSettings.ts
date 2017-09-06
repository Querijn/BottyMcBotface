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
}