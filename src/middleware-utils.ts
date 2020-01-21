import * as express from "express";
import * as request from "./request";

export function jsonEndware<T>(contentGenerator: (req: express.Request) => Promise<T>) {
    return async (req: express.Request, res: express.Response) => {
        try {
            const o = await contentGenerator(req);
            res.json(o);
        } catch(e) {
            res.retError(400, e);
        }
    }
}

export function resourceLoadingMiddleware(loader: (req: express.Request) => Promise<void>) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            await loader(req);
            next();
        } catch(e) {
            res.retError(404, e);
        }
    }
}