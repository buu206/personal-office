"""Verify the gate in isolated temporary repositories; synthetic hooks test routing only.
Never runs against, writes, or changes another real product.
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
KIT_ROOT = PRODUCT_ROOT.parents[1]
CANDIDATE = Path(os.environ.get('OFFICE_VERIFY_CANDIDATE', str(KIT_ROOT / 'verify.sh')))
BASELINE = subprocess.check_output(['git','-C',str(KIT_ROOT),'show','HEAD:verify.sh'])
PROFILE = json.loads((PRODUCT_ROOT/'config/verification.json').read_text())

class GateTests(unittest.TestCase):
    def fixture(self, product='个人办公室', profile=True, hook=None, restore=None):
        tmp=tempfile.TemporaryDirectory(prefix='office-gate-');self.addCleanup(tmp.cleanup)
        root=Path(tmp.name); p=root/'projects'/product
        for d in ['scripts','config','docs/阶段文档','docs/evidence/阶段0','docs/evidence/阶段1','docs/evidence/阶段2-1','docs/evidence/阶段3-0','docs/evidence/阶段3-1']:(p/d).mkdir(parents=True,exist_ok=True)
        (root/'docs/手册').mkdir(parents=True)
        (root/'verify.sh').write_bytes(CANDIDATE.read_bytes())
        for f in ['README.md','docs/项目状态.md','docs/阶段文档/阶段0-PRD补全清单.md','docs/阶段文档/技术适配声明.md','docs/阶段文档/阶段2-1技术开发文档.md','docs/evidence/阶段0/是否表.md','docs/evidence/阶段1/是否表.md','docs/evidence/阶段2-1/是否表.md','docs/evidence/阶段2-1/照着做清单.md']:(p/f).write_text('Synthetic gate test fixture\n')
        # File-existence fixture only, not real user evidence or a browser screenshot.
        (p/'docs/evidence/阶段2-1/fixture.png').write_bytes(b'fixture')
        if profile:(p/'config/verification.json').write_text(json.dumps(PROFILE))
        (p/'scripts/check-upstream.sh').write_text(hook or 'if [ "$1" = tests ]; then\nprintf "# tests 5\\n# pass 5\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n"\nfi\n')
        (p/'scripts/file-roundtrip.mjs').write_text(restore or "import fs from 'node:fs';const [a,p,n]=process.argv.slice(2);if(a==='save')fs.writeFileSync(p,n);else console.log(fs.readFileSync(p,'utf8'));\n")
        for f in ['docs/阶段文档/前端适配声明.md','docs/阶段文档/阶段3-1技术开发文档.md','docs/evidence/阶段3-0/是否表.md','docs/evidence/阶段3-1/是否表.md','docs/evidence/阶段3-1/照着做清单.md']:
            (p/f).write_text('Synthetic gate test fixture\n')
        (p/'docs/evidence/阶段3-1/fixture.png').write_bytes(b'fixture')
        (p/'docs/evidence/阶段3-2').mkdir()
        for f in ['docs/阶段文档/阶段3-2技术开发文档.md','docs/evidence/阶段3-2/是否表.md','docs/evidence/阶段3-2/照着做清单.md','docs/evidence/阶段3-2/fixture.png']:
            (p/f).write_text('Synthetic gate test fixture\n')
        (p/'scripts/check-demo.sh').write_bytes((p/'scripts/check-upstream.sh').read_bytes())
        (p/'scripts/demo-roundtrip.mjs').write_bytes((p/'scripts/file-roundtrip.mjs').read_bytes())
        subprocess.run(['git','init','-q',str(root)],check=True)
        return root,p,product
    def run_gate(self, fixture, stage='阶段2-1'):
        root,_,product=fixture
        return subprocess.run(['bash',str(root/'verify.sh'),product,stage],text=True,capture_output=True)
    def test_approved_profile_accepts_complete_results(self):
        r=self.run_gate(self.fixture());self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertIn('Node 5/5',r.stdout)
    def test_historical_stage2_profile_remains_valid_only_for_stage2(self):
        f=self.fixture();v={**PROFILE,'stages':['阶段2-1']};(f[1]/'config/verification.json').write_text(json.dumps(v))
        self.assertEqual(self.run_gate(f).returncode,0)
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_demo_uses_own_hooks(self):
        f=self.fixture()
        (f[1]/'scripts/check-upstream.sh').write_text('exit 99\n')
        (f[1]/'scripts/file-roundtrip.mjs').write_text('process.exit(99);')
        r=self.run_gate(f,'阶段3-1');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertIn('Demo状态保存',r.stdout);self.assertIn('Demo源码检查',r.stdout)
    def test_demo_hook_missing_rejected(self):
        for name in ['check-demo.sh','demo-roundtrip.mjs']:
            with self.subTest(name=name):
                f=self.fixture();(f[1]/'scripts'/name).unlink()
                r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0)
    def test_demo_empty_tests_rejected(self):
        f=self.fixture();(f[1]/'scripts/check-demo.sh').write_text('exit 0\n')
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0);self.assertIn('Node测试失败或计数无效',r.stdout)
    def test_demo_build_failure_rejected(self):
        f=self.fixture();p=f[1]/'scripts/check-demo.sh';p.write_text(p.read_text()+'if [ "$1" = build ]; then exit 8; fi\n')
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0);self.assertIn('离线构建检查退出码 8',r.stdout)
    def test_demo_restore_failure_rejected(self):
        f=self.fixture();(f[1]/'scripts/demo-roundtrip.mjs').write_text('process.exit(1);')
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0);self.assertIn('本地文件保存或重新导入失败',r.stdout)
    def test_demo_stage3_2_not_preapproved(self):
        f=self.fixture();(f[1]/'config/verification.json').write_text(json.dumps({**PROFILE,'stages':['阶段2-1','阶段3-1']}))
        r=self.run_gate(f,'阶段3-2');self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_tools_stage_uses_frontend_checks_and_propagates_failure(self):
        f=self.fixture();(f[1]/'scripts/check-upstream.sh').write_text('exit 99\n')
        r=self.run_gate(f,'阶段3-2');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        p=f[1]/'scripts/check-demo.sh';p.write_text(p.read_text()+'if [ "$1" = build ]; then exit 8; fi\n')
        r=self.run_gate(f,'阶段3-2');self.assertNotEqual(r.returncode,0);self.assertIn('离线构建检查退出码 8',r.stdout)
    def test_local_closeout_uses_frontend_checks_and_requires_stage3_2(self):
        f=self.fixture();(f[1]/'scripts/check-upstream.sh').write_text('exit 99\n')
        r=self.run_gate(f,'阶段5');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        (f[1]/'docs/阶段文档/阶段3-2技术开发文档.md').unlink()
        r=self.run_gate(f,'阶段5');self.assertNotEqual(r.returncode,0)
    def test_old_profile_does_not_authorize_closeout(self):
        f=self.fixture();(f[1]/'config/verification.json').write_text(json.dumps({**PROFILE,'stages':['阶段2-1','阶段3-1','阶段3-2']}))
        r=self.run_gate(f,'阶段5');self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_closeout_restore_failure_rejected(self):
        f=self.fixture();(f[1]/'scripts/demo-roundtrip.mjs').write_text('process.exit(1);')
        r=self.run_gate(f,'阶段5');self.assertNotEqual(r.returncode,0)
    def test_real_ai_profile_never_inherits_offline_exemption(self):
        f=self.fixture();(f[1]/'config/ai-verification.json').write_text(json.dumps({'profile':'personal-office-real-ai-v1','product':'个人办公室','stages':['阶段2-2'],'model_calls':True}))
        r=self.run_gate(f,'阶段2-2');self.assertNotEqual(r.returncode,0)
        self.assertIn('真实模型冒烟不可豁免',r.stdout);self.assertIn('真实AI完整链路证据未通过',r.stdout)
        self.assertNotIn('N/A（已批准的离线工具范围',r.stdout)
    def test_real_studio_keeps_model_gate_and_rejects_old_profile(self):
        f=self.fixture();p=f[1]/'config/ai-verification.json'
        p.write_text(json.dumps({'profile':'personal-office-real-ai-v1','product':'个人办公室','stages':['阶段2-2','阶段3-3'],'model_calls':True}))
        r=self.run_gate(f,'阶段3-3');self.assertNotEqual(r.returncode,0)
        self.assertIn('真实模型冒烟不可豁免',r.stdout);self.assertIn('真实AI完整链路证据未通过',r.stdout)
        p.write_text(json.dumps({'profile':'personal-office-real-ai-v1','product':'个人办公室','stages':['阶段2-2'],'model_calls':True}))
        r=self.run_gate(f,'阶段3-3');self.assertNotEqual(r.returncode,0)
        self.assertNotIn('采用个人办公室真实AI验收',r.stdout)
    def test_ai_profile_cannot_disable_model_calls(self):
        f=self.fixture();(f[1]/'config/ai-verification.json').write_text(json.dumps({'profile':'personal-office-real-ai-v1','product':'个人办公室','stages':['阶段2-2'],'model_calls':False}))
        r=self.run_gate(f,'阶段2-2');self.assertNotEqual(r.returncode,0)
        self.assertNotIn('N/A（已批准的离线工具范围',r.stdout)
    def test_future_frontend_stage_rejected(self):
        r=self.run_gate(self.fixture(),'阶段3-3');self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_demo_wrong_marker_rejected(self):
        f=self.fixture();(f[1]/'scripts/demo-roundtrip.mjs').write_text("console.log('wrong-marker');")
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0)
    def test_extra_profile_field_rejected(self):
        f=self.fixture();v={**PROFILE,'bypass':True};(f[1]/'config/verification.json').write_text(json.dumps(v))
        r=self.run_gate(f,'阶段3-1');self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_demo_does_not_repeat_frontend_npm_test(self):
        f=self.fixture();p=f[1]/'frontend';p.mkdir();(p/'package.json').write_text(json.dumps({'scripts':{'test':'exit 87'}}))
        r=self.run_gate(f,'阶段3-1');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def test_missing_profile_keeps_model_gate(self):
        r=self.run_gate(self.fixture(profile=False));self.assertNotEqual(r.returncode,0);self.assertIn('待验（缺冒烟记录）',r.stdout)
    def test_invalid_profile_is_rejected(self):
        f=self.fixture();(f[1]/'config/verification.json').write_text('{broken');r=self.run_gate(f);self.assertNotEqual(r.returncode,0);self.assertIn('离线配置无效',r.stdout)
    def test_unapproved_stage_does_not_inherit_exemption(self):
        r=self.run_gate(self.fixture(),stage='阶段2-2');self.assertNotEqual(r.returncode,0);self.assertIn('待验（缺冒烟记录）',r.stdout)
    def test_empty_and_failing_tests_are_rejected(self):
        for hook in ['exit 0\n','printf "# tests 5\\n# pass 5\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n"\nexit 1\n','printf "# tests 5\\n# pass 4\\n# fail 0\\n# cancelled 0\\n# skipped 1\\n# todo 0\\n"\n']:
            with self.subTest(hook=hook):
                r=self.run_gate(self.fixture(hook=hook));self.assertNotEqual(r.returncode,0);self.assertIn('Node测试失败或计数无效',r.stdout)
    def test_build_failure_is_not_hidden(self):
        f=self.fixture();p=f[1]/'scripts/check-upstream.sh';p.write_text(p.read_text()+'if [ "$1" = build ]; then exit 7; fi\n');r=self.run_gate(f);self.assertNotEqual(r.returncode,0);self.assertIn('离线构建检查退出码 7',r.stdout)
    def test_restore_failure_is_not_hidden(self):
        r=self.run_gate(self.fixture(restore='process.exit(1);'));self.assertNotEqual(r.returncode,0);self.assertIn('本地文件保存或重新导入失败',r.stdout)
    def test_other_product_summaries_match_unmodified_script(self):
        for stage in ['阶段2-1','阶段3-1','阶段5']:
            with self.subTest(stage=stage):
                f=self.fixture(product='fixture-other');new=self.run_gate(f,stage);(f[0]/'verify.sh').write_bytes(BASELINE);old=self.run_gate(f,stage)
                summaries=lambda s:[line for line in s.splitlines() if line.startswith('是否表第 ')]
                self.assertEqual(new.returncode,old.returncode);self.assertEqual(summaries(new.stdout),summaries(old.stdout))

if __name__=='__main__':unittest.main()
