import {Extension} from "./req-ext";

// extending Express.Request and Express.Response
declare global {
    namespace Express {
        interface Request {
            extension: Extension;
        }
        interface Response {
            retError(status: number, err: any): void;
            errorObj: any;
        }
    }
}

export {}