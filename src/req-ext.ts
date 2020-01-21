import {TokensStore} from "./tokens-store";
import {AppTokenAcquisition} from "./token-acquisition";
import * as types from "./types";

export class Extension {
    public tokenAcquisition: AppTokenAcquisition;
    public app: types.App;
    constructor(public tokensStore: TokensStore) {

    }
}