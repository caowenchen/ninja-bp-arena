import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { describeSequence } from '@/engine/ruleEngine'
import { DEFAULT_RULE } from '@/data/defaultRules'

/** /about —— 简洁的项目说明页 */
export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16">
      <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-fog-400 hover:text-fog-100">
        <ArrowLeft size={14} /> 返回首页
      </Link>

      <h1 className="mt-4 text-xl font-bold text-fog-100">关于 忍界 BP</h1>
      <p className="mt-1 text-xs text-fog-600">Ninja BP Arena v{__APP_VERSION__}</p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-fog-300">
        <p>
          一款纯前端的《火影忍者手游》武斗赛 Ban/Pick 模拟器：完整 BO3 流程、配置化规则、
          撤销与复盘、忍者池管理。所有数据保存在浏览器本地（localStorage），无需登录、无服务器。
        </p>

        <p className="rounded border border-gold-accent/30 bg-gold-accent/5 p-3 text-xs text-gold-accent">
          本工具为玩家制作的非官方赛事 BP 辅助工具，与游戏官方无隶属或合作关系。
          内置忍者与标签均为示例数据，不代表官方名单；项目不附带任何未经授权的官方素材。
        </p>

        <section>
          <h2 className="mb-1.5 text-sm font-bold text-fog-100">默认规则（可在设置中修改）</h2>
          <p className="text-xs text-fog-500">
            Ban（第 1 局，全场生效）：{describeSequence(DEFAULT_RULE.banSequence)}
          </p>
          <p className="text-xs text-fog-500">Pick（每局）：{describeSequence(DEFAULT_RULE.pickSequence)}</p>
          <p className="mt-1 text-xs text-fog-600">
            BO3 先胜 2 局；第 2/3 局不再 Ban，但首局 Ban 持续有效；之前小局出场的忍者整场禁用。
            规则模板仅供参考，不代表官方最新规则。
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-sm font-bold text-fog-100">数据说明</h2>
          <p className="text-xs text-fog-600">
            忍者池、规则模板、设置与比赛记录全部存储在本机浏览器中，可在「设置 → 数据备份」导出完整备份，
            也可在「忍者池」导入自定义 JSON。清除浏览器数据会移除这些内容。
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-sm font-bold text-fog-100">源码</h2>
          <a
            href="https://github.com/caowenchen/ninja-bp-arena"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-team-soft underline underline-offset-2 hover:brightness-125"
          >
            github.com/caowenchen/ninja-bp-arena
          </a>
        </section>
      </div>
    </div>
  )
}
