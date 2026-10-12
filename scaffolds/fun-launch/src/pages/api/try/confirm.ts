import { confirmWith } from '../confirm';
import { devnet } from '@/server/devnet';

/** Devnet confirmation for /try. */
export default confirmWith(devnet);
