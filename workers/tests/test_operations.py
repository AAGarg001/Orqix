import importlib.util
from pathlib import Path
import pandas as pd
import pytest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ops_adapter',ROOT/'workers'/'operations.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
@pytest.fixture
def ops(tmp_path):
    return module.Operations(ROOT/'commonportalpwpscraper 2.1.py',tmp_path,lambda *_:object(),lambda *_:None)
def workbook(ops,tmp_path,pdf=True):
    values={c:'value' for c in ops.bot.UPLOAD_COLUMNS}
    values.update({'Category of Plastic':'Cat I','Name of Supplier':'Supplier','Address Line 1':'Address','Address Line 2':'','State':'Delhi','City':'Delhi','Pin Code':'110001','Is Supplier GST Available (Yes/No)':'No','Supplier GST Number':'',ops.bot.UPLOAD_MOBILE_COLUMN:'9876543210','Procurement Date (YYYY-MM-DD)':'2026-04-01','Quantity (MT)':'2.5','Invoice Number':'INV-001','HSN Code':'3901','Invoice Filename':'invoice.pdf'})
    if pdf:(ops.bot.UPLOAD_INVOICE_DIR/'invoice.pdf').write_bytes(b'%PDF-1.4\n')
    p=tmp_path/'input.xlsx';pd.DataFrame([values,values]).to_excel(p,index=False);return p
def test_source_validation_catches_duplicates_and_missing_invoice(ops,tmp_path):
    p=workbook(ops,tmp_path,False);result=ops.validate('pwp',p);assert result['valid']==0;assert 'PDF not found' in result['rows'][0]['errors'];assert 'Duplicate' in result['rows'][1]['errors']
def test_source_schemas_are_distinct_and_preserved(ops):
    assert ops.schema('pwp')==ops.bot.UPLOAD_COLUMNS
    assert ops.schema('pibo')==ops.bot.PIBO_COLUMNS
    assert ops.schema('sales')==ops.bot.SALES_COLUMNS
    assert ops.schema('pwp')!=ops.schema('pibo')
def test_unvalidated_or_replayed_upload_is_blocked(ops):
    with pytest.raises(ValueError,match='hash'):ops.execute_upload('x'*64,lambda *_:None)
    ops.preview_hash='x'*64;ops.consumed.add('x'*64)
    with pytest.raises(ValueError,match='already attempted'):ops.execute_upload('x'*64,lambda *_:None)
def test_delete_rejects_unapproved_ids_and_mismatched_snapshot(ops):
    ops.snapshot={'hash':'a'*64,'records':{'b'*64:{'record':'one'}},'year':'2026'}
    with pytest.raises(ValueError,match='snapshot'):ops.execute_deletions(['c'*64],'a'*64)
    with pytest.raises(ValueError,match='snapshot'):ops.execute_deletions(['b'*64],'d'*64)
