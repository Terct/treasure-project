const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const fs = require('fs').promises;
const path = require('path');
const xlsx = require('xlsx'); // Importe a biblioteca xlsx
const { Console } = require('console');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const filePath = path.join(__dirname, 'data', 'data.json');
const tempFolderPath = path.join(__dirname, 'src', 'temp');

// Função que faz a requisição para a URL armazenada na variável de ambiente
async function get_IPCA_JSON() {
    try {
        const url = process.env.URL_TOOL_IPCA;

        if (!url) {
            throw new Error('A variável de ambiente URL_TOOL_VNA não está definida');
        }

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Erro ao fazer a requisição:', error.message);
        throw error;
    }
}

// Função para salvar os dados no Supabase
async function saveToSupabase(processedData) {
    try {
        const { data, error } = await supabase
            .from('base_geral_unitaty_items')
            .update({
                content: processedData,
                last_update: new Date()
            })
            .eq('id', 'all_IPCA');

        if (error) {
            throw error;
        }

        console.log('Dados salvos no Supabase com sucesso:');
    } catch (error) {
        console.error('Erro ao salvar os dados no Supabase:', error.message);
    }
}

// Função start que executa get_url e faz uma segunda requisição
async function start() {
    try {
        let data = await get_IPCA_JSON();

        console.log(data)

        await saveToSupabase(data);

        console.log(`O item { TODAS IPCA } foi atualizado: ${new Date()}`);

        return true;
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

// Executa a função start
start();
