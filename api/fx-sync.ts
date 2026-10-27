import local from "../server/fx/app";
import { withNasBackend } from "../server/nas/remote";
export default withNasBackend(local);
