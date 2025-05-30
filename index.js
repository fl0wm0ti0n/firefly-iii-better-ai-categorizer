import 'dotenv/config';
import App from "./src/App.js";

(async function () {
    const app = new App();
    await app.run();
})();