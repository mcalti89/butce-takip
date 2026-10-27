import local from "../server/budget/app";
import { withNasBackend } from "../server/nas/remote";
export default withNasBackend(local);
