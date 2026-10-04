from copy import deepcopy
from datetime import date

import pytest

from src.data_loader import load_excel, locate_excel
from src.database import Database
from src.models import Settings
from src.recommendation_service import RecommendationService


@pytest.fixture(scope="session")
def workbook():
    return locate_excel()


@pytest.fixture(scope="session")
def bundle(workbook):
    return load_excel(workbook)


@pytest.fixture
def service(tmp_path, workbook):
    instance = RecommendationService(Database(tmp_path / "test.db"))
    instance.import_excel(workbook, user="Teste")
    return instance


@pytest.fixture
def row():
    return {"sku":"TEST-001", "produto":"Produto de teste", "canal":"Loja física", "curva_abc":"A", "marca":"Marca", "categoria":"Rações", "status":"Ativo",
            "preco_atual":100, "custo_total_referencia":70, "taxa_canal":0.05, "margem_minima":0.20, "margem_alvo":0.27,
            "estoque_atual":100, "cobertura_dias":30}


@pytest.fixture
def rule():
    return {"nome":"Curva A", "descricao":"Proteção e exceção", "ativa":True, "prioridade":10, "tipo_escopo":"curva_abc", "valores_escopo":["A"],
            "margem_minima":.25, "margem_alvo":.28, "variacao_maxima_subida":.05, "variacao_maxima_reducao":.05,
            "condicao_sem_venda_ativa":False, "dias_sem_venda":60, "margem_excecao_sem_venda":.15,
            "permite_margem_abaixo_base":False, "exige_aprovacao":True, "inicio_vigencia":"2026-09-01", "fim_vigencia":"2026-10-31",
            "justificativa":"Regra de teste", "id":1}


@pytest.fixture
def signals():
    return {"sales":{"dias_sem_venda":10, "origem":"calculado", "comprovado":True, "queda_3_meses":False},
            "competition":{"mediana":100, "quantidade":3, "encontrados":3, "desatualizado":False, "anomalia":False, "historico_24h_disponivel":True, "observacoes":[]},
            "other":{"promocoes":[], "promocao_incompleta":False, "alteracao_recente":False, "estrategico":False}}


@pytest.fixture
def approved(service):
    service.generate("Teste")
    rec = next(r for r in service.latest() if r.get("preco_sugerido") and not r["bloqueios"] and not r["sinais_utilizados"].get("promocoes"))
    service.decide(rec["id"], "Aprovar", "Teste", "Riscos verificados")
    return service, rec
