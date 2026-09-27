import { revokePresentedToken } from '../../utils/api-token'
import { appError } from '../../utils/errors'

// 发布脚本的 `--disconnect`：吊销请求头里出示的这个令牌。只能吊销自己手里的那一个，
// 所以持有令牌本身就是足够的证明。

export default defineEventHandler(async (event) => {
  if (!(await revokePresentedToken(event))) {
    throw appError(401, 'TOKEN_INVALID', '发布令牌无效或已被撤销')
  }
  return { ok: true }
})
