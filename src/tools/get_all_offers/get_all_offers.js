const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const fs = require('fs').promises;
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const filePath = path.join(__dirname, 'data', 'data.json');


// Função que faz a requisição para a URL armazenada na variável de ambiente
async function get_url() {
    try {
        const url = process.env.URL_TOOL_ALL_OFFERS;

        if (!url) {
            throw new Error('A variável de ambiente URL_TOOL_ALL_OFFERS não está definida');
        }

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Erro ao fazer a requisição:', error.message);
        throw error;
    }
}


// Função que converte CSV para JSON
function convertCSVtoJSON(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(';');

    const json = lines.slice(1).map(line => {
        const values = line.split(';');
        if (values.length !== headers.length) {
            console.warn(`Número de valores não corresponde ao número de cabeçalhos na linha: ${line}`);
            return null; // Ignorar linhas com número incorreto de valores
        }

        const entry = {};
        headers.forEach((header, index) => {
            entry[header.trim()] = values[index].trim();
        });

        return entry;
    }).filter(entry => entry !== null); // Filtrar entradas inválidas

    return json;
}


// Função que salva o JSON em um arquivo
async function saveToFile(jsonData) {
    try {
        // Converte o JSON para string
        const jsonString = JSON.stringify(jsonData, null, 2);

        // Salva o JSON no arquivo
        await fs.writeFile(filePath, jsonString);

        console.log(`Dados salvos em ${filePath}`);
    } catch (error) {
        console.error('Erro ao salvar dados no arquivo:', error.message);
        throw error;
    }
}

// Função para atualizar os dados no Supabase
async function updateSupabase(filePath) {
    try {
        const directory = [{ "directory" : filePath   }]

        const { data: existingData, error } = await supabase
            .from('base_geral_unitaty_items')
            .update({ content: directory, last_update: new Date() })
            .eq('id', 'all_offers');

        if (error) {
            throw new Error(`Erro ao atualizar dados no Supabase: ${error.message}`);
        }

        console.log('Dados atualizados com sucesso no Supabase');
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

// Função start que executa get_url e faz uma segunda requisição
async function start() {
    try {
        const data = await get_url();

        if (!data || !data.link) {
            throw new Error('A resposta não contém a propriedade link');
        }

        const secondResponse = await axios.get(data.link);
        const csvData = secondResponse.data;

        const jsonData = convertCSVtoJSON(csvData);
        await saveToFile(jsonData);
        await updateSupabase(filePath);

        console.log(`O item { TODAS OFERTAS } foi atualizado: ${new Date()}`);

        return true;
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

// Executa a função start
start();
