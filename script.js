const ITENS = [
	"SEO",
	"Tabela de Medidas",
	"Tiktok",
	"Verificar Marca (p/ Tiktok)",
	"Reclame Aqui",
	"Produtos Relacionados",
	"Compre Junto",
];

const lista = document.getElementById("listaItens");
const contador = document.getElementById("contador");
const titulo = document.getElementById("tituloEditavel");
const btnReset = document.getElementById("btnReset");
const btnMarcarTodos = document.getElementById("btnMarcarTodos");
const btnGuardar = document.getElementById("btnGuardar");
const arquivoAtual = document.getElementById("arquivoAtual");
const aviso = document.getElementById("aviso");
const avisoTexto = document.getElementById("avisoTexto");

const NOME_PADRAO = "produtos.json";
const CHAVE_LOCAL = "checklist-registros";

let arquivoHandle = null;

function criarItem(nome, indice) {
	const li = document.createElement("li");
	li.className = "list-group-item d-flex align-items-center gap-2";

	const check = document.createElement("input");
	check.type = "checkbox";
	check.className = "form-check-input item-check m-0";
	check.id = "item-" + indice;

	const label = document.createElement("label");
	label.className = "item-label form-check-label flex-grow-1";
	label.setAttribute("for", check.id);
	label.textContent = nome;

	li.append(check, label);
	return li;
}

function atualizarContador() {
	const checks = lista.querySelectorAll(".item-check");
	const marcados = lista.querySelectorAll(".item-check:checked").length;

	contador.textContent = marcados + " / " + checks.length;
	contador.classList.toggle(
		"text-bg-success",
		marcados === checks.length && checks.length > 0,
	);
	contador.classList.toggle(
		"text-bg-secondary",
		marcados !== checks.length || checks.length === 0,
	);
}

function marcarTodos(valor) {
	lista.querySelectorAll(".item-check").forEach((check) => {
		check.checked = valor;
	});
	atualizarContador();
}

ITENS.forEach((nome, indice) => {
	lista.appendChild(criarItem(nome, indice));
});

lista.addEventListener("change", atualizarContador);

btnReset.addEventListener("click", () => {
	marcarTodos(false);
});

btnMarcarTodos.addEventListener("click", () => {
	const todosMarcados =
		lista.querySelectorAll(".item-check:checked").length === ITENS.length;
	marcarTodos(!todosMarcados);
});

// Enter no título finaliza a edição em vez de criar uma nova linha
titulo.addEventListener("keydown", (evento) => {
	if (evento.key === "Enter") {
		evento.preventDefault();
		titulo.blur();
	}
});

// Cola apenas texto puro, sem formatação vinda de outra página
titulo.addEventListener("paste", (evento) => {
	evento.preventDefault();
	const texto = (evento.clipboardData || window.clipboardData).getData("text");
	document.execCommand("insertText", false, texto.replace(/\s+/g, " ").trim());
});

function avisar(mensagem, tipo) {
	avisoTexto.textContent = mensagem;
	aviso.className = `toast align-items-center border-0 text-bg-${tipo}`;
	bootstrap.Toast.getOrCreateInstance(aviso, { delay: 5000 }).show();
}

function mostrarArquivo(nome) {
	const icone = document.createElement("i");
	icone.className = "bi bi-file-earmark-code";
	arquivoAtual.textContent = "";
	arquivoAtual.append(icone, ` ${nome}`);
}

// { item: "nome do produto", correcoes: [{ "item-correcao": "SEO", corrigido: true }] }
function montarRegistro() {
	return {
		item: titulo.textContent.trim(),
		correcoes: ITENS.map((nome, indice) => ({
			"item-correcao": nome,
			corrigido: document.getElementById(`item-${indice}`).checked,
		})),
	};
}

// O handle do arquivo escolhido fica no IndexedDB para continuar
// gravando no mesmo JSON depois de recarregar a página.
function acessarHandleSalvo(valor) {
	return new Promise((resolve, reject) => {
		const requisicao = indexedDB.open("checklist-produto", 1);
		requisicao.onupgradeneeded = () =>
			requisicao.result.createObjectStore("handles");
		requisicao.onerror = () => reject(requisicao.error);
		requisicao.onsuccess = () => {
			const gravando = valor !== undefined;
			const transacao = requisicao.result.transaction(
				"handles",
				gravando ? "readwrite" : "readonly",
			);
			const armazem = transacao.objectStore("handles");
			const operacao = gravando
				? armazem.put(valor, "arquivo")
				: armazem.get("arquivo");
			operacao.onsuccess = () => resolve(operacao.result);
			operacao.onerror = () => reject(operacao.error);
		};
	});
}

async function temPermissao(handle) {
	const opcoes = { mode: "readwrite" };
	if ((await handle.queryPermission(opcoes)) === "granted") return true;
	return (await handle.requestPermission(opcoes)) === "granted";
}

async function garantirHandle() {
	if (!arquivoHandle) {
		arquivoHandle = await acessarHandleSalvo().catch(() => null);
	}
	if (arquivoHandle && (await temPermissao(arquivoHandle)))
		return arquivoHandle;

	arquivoHandle = await window.showSaveFilePicker({
		suggestedName: NOME_PADRAO,
		types: [
			{
				description: "Arquivo JSON",
				accept: { "application/json": [".json"] },
			},
		],
	});
	await acessarHandleSalvo(arquivoHandle).catch(() => null);
	return arquivoHandle;
}

async function lerDados(handle) {
	const texto = (await (await handle.getFile()).text()).trim();
	if (!texto) return { items: [] };

	const dados = JSON.parse(texto);
	if (!Array.isArray(dados.items)) {
		throw new Error(`${handle.name} não tem um array "items".`);
	}
	return dados;
}

async function guardarNoArquivo(registro) {
	const handle = await garantirHandle();
	const dados = await lerDados(handle);
	dados.items.push(registro);

	const escrita = await handle.createWritable();
	await escrita.write(JSON.stringify(dados, null, 2));
	await escrita.close();

	mostrarArquivo(handle.name);
	return handle.name;
}

// Navegadores sem File System Access API (Firefox, Safari): acumula em
// localStorage e baixa o JSON completo a cada vez que guarda.
function guardarComDownload(registro) {
	let dados = { items: [] };
	try {
		dados = JSON.parse(localStorage.getItem(CHAVE_LOCAL)) || dados;
	} catch {
		dados = { items: [] };
	}
	if (!Array.isArray(dados.items)) dados.items = [];

	dados.items.push(registro);
	localStorage.setItem(CHAVE_LOCAL, JSON.stringify(dados));

	const url = URL.createObjectURL(
		new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = NOME_PADRAO;
	link.click();
	URL.revokeObjectURL(url);
}

btnGuardar.addEventListener("click", async (evento) => {
	const registro = montarRegistro();
	if (!registro.item) {
		avisar("Digite o título do produto antes de guardar.", "warning");
		titulo.focus();
		return;
	}

	// Shift + clique escolhe outro arquivo de destino
	if (evento.shiftKey) arquivoHandle = null;

	btnGuardar.disabled = true;
	try {
		if (window.showSaveFilePicker) {
			const nome = await guardarNoArquivo(registro);
			avisar(`"${registro.item}" guardado em ${nome}.`, "success");
		} else {
			guardarComDownload(registro);
			avisar(
				`"${registro.item}" adicionado — baixei o ${NOME_PADRAO} atualizado.`,
				"success",
			);
		}
	} catch (erro) {
		if (erro.name !== "AbortError") {
			avisar(`Não foi possível guardar: ${erro.message}`, "danger");
		}
	} finally {
		btnGuardar.disabled = false;
	}
});

async function restaurarArquivo() {
	if (!window.showSaveFilePicker) {
		mostrarArquivo(`${NOME_PADRAO} (download)`);
		return;
	}
	const handle = await acessarHandleSalvo().catch(() => null);
	if (handle) {
		arquivoHandle = handle;
		mostrarArquivo(handle.name);
	}
}

restaurarArquivo();
atualizarContador();
